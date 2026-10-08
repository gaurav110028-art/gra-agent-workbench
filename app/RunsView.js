'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  getRunHistory,
  clearRunHistory,
  deleteRun,
  subscribeToRunHistory,
} from './runHistory';

const HAIKU_45_INPUT_USD_PER_MILLION = 1;
const HAIKU_45_OUTPUT_USD_PER_MILLION = 5;

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function formatDuration(ms) {
  if (ms === null || ms === undefined) return '-';

  if (ms < 1000) {
    return `${ms} ms`;
  }

  const seconds = Math.round(ms / 1000);

  if (seconds < 60) {
    return `${seconds}s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;

  return `${minutes}m ${remaining}s`;
}

function formatTokens(value) {
  const number = Number(value || 0);

  return new Intl.NumberFormat('en-IN').format(number);
}

function formatUsd(value) {
  const number = Number(value || 0);

  if (number === 0) {
    return '$0.0000';
  }

  if (number < 0.01) {
    return `$${number.toFixed(5)}`;
  }

  return `$${number.toFixed(4)}`;
}

function getStatusClass(status) {
  return String(status || '')
    .toLowerCase()
    .replaceAll(' ', '-');
}

function versionLabel(run) {
  if (!run?.workflowVersion) return null;

  return `${run.workflowVersionStatus || 'Version'} v${run.workflowVersion}`;
}

function getClaudeUsage(run) {
  const usage =
    run?.auditResult?.usage ||
    run?.aiUsage ||
    null;

  if (!usage) return null;

  const inputTokens =
    Number(usage.input_tokens || 0);

  const outputTokens =
    Number(usage.output_tokens || 0);

  if (
    inputTokens === 0 &&
    outputTokens === 0
  ) {
    return null;
  }

  const estimatedCostUsd =
    (inputTokens / 1_000_000) *
      HAIKU_45_INPUT_USD_PER_MILLION +
    (outputTokens / 1_000_000) *
      HAIKU_45_OUTPUT_USD_PER_MILLION;

  return {
    model:
      run?.auditResult?.model ||
      'claude-haiku-4-5-20251001',
    inputTokens,
    outputTokens,
    totalTokens:
      inputTokens + outputTokens,
    estimatedCostUsd,
  };
}

export default function RunsView() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [filter, setFilter] = useState('All');

  const loadRuns = () => {
    const history = getRunHistory();

    setRuns(history);

    setSelectedRun((current) => {
      if (!current) return null;

      return (
        history.find(
          (run) => run.id === current.id
        ) || null
      );
    });
  };

  useEffect(() => {
    loadRuns();

    const unsubscribe =
      subscribeToRunHistory(loadRuns);

    return unsubscribe;
  }, []);

  const filteredRuns = useMemo(() => {
    if (filter === 'All') {
      return runs;
    }

    return runs.filter(
      (run) => run.status === filter
    );
  }, [runs, filter]);

  const usageSummary = useMemo(() => {
    return runs.reduce(
      (summary, run) => {
        const usage =
          getClaudeUsage(run);

        if (!usage) return summary;

        return {
          trackedRuns:
            summary.trackedRuns + 1,
          inputTokens:
            summary.inputTokens +
            usage.inputTokens,
          outputTokens:
            summary.outputTokens +
            usage.outputTokens,
          estimatedCostUsd:
            summary.estimatedCostUsd +
            usage.estimatedCostUsd,
        };
      },
      {
        trackedRuns: 0,
        inputTokens: 0,
        outputTokens: 0,
        estimatedCostUsd: 0,
      }
    );
  }, [runs]);

  const selectedUsage =
    getClaudeUsage(selectedRun);

  const statuses = [
    'All',
    'Running',
    'Completed',
    'Waiting',
    'Rejected',
    'Failed',
  ];

  const clearAll = () => {
    if (
      !window.confirm(
        'Clear all run history?'
      )
    ) {
      return;
    }

    clearRunHistory();
    setSelectedRun(null);
  };

  const removeRun = (runId) => {
    if (
      !window.confirm(
        'Delete this run record?'
      )
    ) {
      return;
    }

    deleteRun(runId);

    if (
      selectedRun?.id === runId
    ) {
      setSelectedRun(null);
    }
  };

  return (
    <div className="runsPage">
      <div className="runsTopbar">
        <div>
          <h1>Runs</h1>

          <span>
            Workflow execution history
          </span>
        </div>

        <button
          className="runsClearButton"
          onClick={clearAll}
          disabled={runs.length === 0}
        >
          Clear History
        </button>
      </div>

      <div className="runsFilters">
        {statuses.map((status) => (
          <button
            key={status}
            className={
              filter === status
                ? 'active'
                : ''
            }
            onClick={() =>
              setFilter(status)
            }
          >
            {status}
          </button>
        ))}
      </div>

      {usageSummary.trackedRuns > 0 && (
        <div className="claudeUsageSummary">
          <div>
            <span>Claude Usage</span>
            <strong>
              Haiku 4.5
            </strong>
          </div>

          <div>
            <span>Tracked Runs</span>
            <strong>
              {usageSummary.trackedRuns}
            </strong>
          </div>

          <div>
            <span>Input Tokens</span>
            <strong>
              {formatTokens(
                usageSummary.inputTokens
              )}
            </strong>
          </div>

          <div>
            <span>Output Tokens</span>
            <strong>
              {formatTokens(
                usageSummary.outputTokens
              )}
            </strong>
          </div>

          <div className="claudeUsageCost">
            <span>Estimated AI Cost</span>
            <strong>
              {formatUsd(
                usageSummary.estimatedCostUsd
              )}
            </strong>
          </div>
        </div>
      )}

      {filteredRuns.length === 0 ? (
        <div className="runsEmpty">
          <div className="runsEmptyIcon">
            ▶
          </div>

          <h2>No runs yet</h2>

          <p>
            Test or execute a workflow and its
            history will appear here.
          </p>
        </div>
      ) : (
        <div className="runsLayout">
          <div className="runsList">
            {filteredRuns.map((run) => {
              const cardUsage =
                getClaudeUsage(run);

              return (
                <button
                  key={run.id}
                  className={`
                    runCard
                    ${
                      selectedRun?.id ===
                      run.id
                        ? 'selected'
                        : ''
                    }
                  `}
                  onClick={() =>
                    setSelectedRun(run)
                  }
                >
                  <div className="runCardTop">
                    <div>
                      <strong>
                        {run.agentName || 'Agent'}
                      </strong>

                      <div className="workflowRecordMetaLine">
                        <span>
                          {run.workflowName ||
                            'Main Workflow'}
                        </span>

                        {versionLabel(run) && (
                          <span
                            className={`workflowRecordVersion ${
                              run.workflowVersionStatus ===
                              'Published'
                                ? 'published'
                                : 'draft'
                            }`}
                          >
                            {versionLabel(run)}
                          </span>
                        )}
                      </div>
                    </div>

                    <span
                      className={`
                        runStatus
                        runStatus-${getStatusClass(
                          run.status
                        )}
                      `}
                    >
                      {run.status}
                    </span>
                  </div>

                  <div className="runCardMeta">
                    <span>
                      {run.type || 'Test Run'}
                    </span>

                    <span>
                      {formatDate(
                        run.startedAt
                      )}
                    </span>

                    <span>
                      {formatDuration(
                        run.durationMs
                      )}
                    </span>
                  </div>

                  {cardUsage && (
                    <div className="runCardUsage">
                      <span>
                        Claude{' '}
                        {formatTokens(
                          cardUsage.totalTokens
                        )}{' '}
                        tokens
                      </span>

                      <strong>
                        {formatUsd(
                          cardUsage.estimatedCostUsd
                        )}
                      </strong>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="runDetails">
            {!selectedRun ? (
              <div className="runDetailsEmpty">
                <div>◇</div>

                <p>
                  Select a run to view its
                  execution details.
                </p>
              </div>
            ) : (
              <>
                <div className="runDetailsHeader">
                  <div>
                    <h2>
                      {selectedRun.agentName}
                    </h2>

                    <div className="workflowRecordMetaLine">
                      <span>
                        {selectedRun.workflowName}
                      </span>

                      {versionLabel(selectedRun) && (
                        <span
                          className={`workflowRecordVersion ${
                            selectedRun.workflowVersionStatus ===
                            'Published'
                              ? 'published'
                              : 'draft'
                          }`}
                        >
                          {versionLabel(selectedRun)}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    className="deleteRunButton"
                    onClick={() =>
                      removeRun(
                        selectedRun.id
                      )
                    }
                  >
                    Delete
                  </button>
                </div>

                <div className="runSummaryGrid">
                  <div>
                    <span>Status</span>
                    <strong>
                      {selectedRun.status}
                    </strong>
                  </div>

                  <div>
                    <span>Type</span>
                    <strong>
                      {selectedRun.type}
                    </strong>
                  </div>

                  <div>
                    <span>Started</span>
                    <strong>
                      {formatDate(
                        selectedRun.startedAt
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>Duration</span>
                    <strong>
                      {formatDuration(
                        selectedRun.durationMs
                      )}
                    </strong>
                  </div>
                </div>

                {selectedUsage && (
                  <div className="runClaudeUsageBox">
                    <div className="runClaudeUsageHeader">
                      <div>
                        <span>
                          Claude API Usage
                        </span>

                        <strong>
                          Claude Haiku 4.5
                        </strong>
                      </div>

                      <div className="runClaudeUsagePrice">
                        <span>
                          Estimated Cost
                        </span>

                        <strong>
                          {formatUsd(
                            selectedUsage.estimatedCostUsd
                          )}
                        </strong>
                      </div>
                    </div>

                    <div className="runClaudeUsageGrid">
                      <div>
                        <span>
                          Input Tokens
                        </span>
                        <strong>
                          {formatTokens(
                            selectedUsage.inputTokens
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Output Tokens
                        </span>
                        <strong>
                          {formatTokens(
                            selectedUsage.outputTokens
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Total Tokens
                        </span>
                        <strong>
                          {formatTokens(
                            selectedUsage.totalTokens
                          )}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Model ID
                        </span>
                        <strong className="runClaudeModelId">
                          {selectedUsage.model}
                        </strong>
                      </div>
                    </div>

                    <p className="runClaudeUsageNote">
                      Estimated using Claude Haiku 4.5
                      standard API pricing: $1 per
                      million input tokens and $5 per
                      million output tokens. Actual
                      provider billing is authoritative.
                    </p>
                  </div>
                )}

                {selectedRun.approval && (
                  <div className="runApprovalBox">
                    <span>
                      Human Approval
                    </span>

                    <strong>
                      {
                        selectedRun
                          .approval
                          .decision
                      }
                    </strong>

                    <small>
                      {
                        selectedRun
                          .approval
                          .by ||
                        'Reviewer'
                      }
                    </small>
                  </div>
                )}

                <div className="runStepsHeader">
                  Execution Steps
                </div>

                <div className="runStepsList">
                  {(selectedRun.steps || []).map(
                    (step, index) => (
                      <div
                        className={`
                          runStepRow
                          runStep-${getStatusClass(
                            step.status
                          )}
                        `}
                        key={
                          step.nodeId ||
                          index
                        }
                      >
                        <div className="runStepNumber">
                          {index + 1}
                        </div>

                        <div className="runStepIcon">
                          {step.icon || '◇'}
                        </div>

                        <div className="runStepInfo">
                          <strong>
                            {step.name}
                            {typeof step.durationMs === 'number' && (
                              <small className="runStepDuration">
                                {step.durationMs} ms
                              </small>
                            )}
                          </strong>

                          <span>
                            {step.note ||
                              'No details'}
                          </span>

                          {(step.input !== undefined ||
                            step.output !== undefined) && (
                            <details className="runStepPayload">
                              <summary>Input / Output JSON</summary>
                              <div>
                                <div>
                                  <b>Input</b>
                                  <pre>
                                    {step.input === undefined
                                      ? '—'
                                      : JSON.stringify(step.input, null, 2)}
                                  </pre>
                                </div>
                                <div>
                                  <b>{step.error ? 'Error' : 'Output'}</b>
                                  <pre>
                                    {step.error
                                      ? JSON.stringify(
                                          { error: step.error, output: step.output },
                                          null,
                                          2
                                        )
                                      : step.output === undefined
                                        ? '—'
                                        : JSON.stringify(step.output, null, 2)}
                                  </pre>
                                </div>
                              </div>
                            </details>
                          )}
                        </div>

                        <div className="runStepStatus">
                          {step.status}
                        </div>
                      </div>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
