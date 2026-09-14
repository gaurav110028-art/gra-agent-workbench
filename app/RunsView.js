'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  getRunHistory,
  clearRunHistory,
  deleteRun,
  subscribeToRunHistory,
} from './runHistory';

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

function getStatusClass(status) {
  return String(status || '')
    .toLowerCase()
    .replaceAll(' ', '-');
}

export default function RunsView() {
  const [runs, setRuns] = useState([]);
  const [selectedRun, setSelectedRun] = useState(null);
  const [filter, setFilter] = useState('All');

  const loadRuns = () => {
    const history = getRunHistory();

    setRuns(history);

    if (selectedRun) {
      const updatedSelected = history.find(
        (run) => run.id === selectedRun.id
      );

      setSelectedRun(updatedSelected || null);
    }
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

            {filteredRuns.map((run) => (

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
                      {run.agentName ||
                        'Agent'}
                    </strong>

                    <span>
                      {run.workflowName ||
                        'Main Workflow'}
                    </span>
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
                    {run.type ||
                      'Test Run'}
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

              </button>

            ))}

          </div>

          <div className="runDetails">

            {!selectedRun ? (

              <div className="runDetailsEmpty">

                <div>
                  ◇
                </div>

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

                    <span>
                      {selectedRun.workflowName}
                    </span>
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
                          </strong>

                          <span>
                            {step.note ||
                              'No details'}
                          </span>

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
