'use client';

import { useEffect, useMemo, useState } from 'react';

import {
  getApprovals,
  decideApproval,
  deleteApproval,
  clearApprovalHistory,
  subscribeToApprovals,
} from './approvalQueue';

import {
  getRunHistory,
  saveRun,
  finishRun,
} from './runHistory';

function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function statusClass(status) {
  return String(status || '')
    .toLowerCase()
    .replaceAll(' ', '-');
}

function getPostApprovalNote(step) {
  if (
    ['aiPrompt', 'extract', 'classify', 'summarize'].includes(
      step.type
    )
  ) {
    return 'AI step simulated after approval. No model was called.';
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
    ].includes(step.type)
  ) {
    return 'External action simulated after approval. Nothing was sent or changed.';
  }

  if (step.type === 'delay') {
    return 'Delay simulated after approval. No real waiting occurred.';
  }

  if (step.type === 'condition') {
    return 'Simulated result after approval: True';
  }

  return 'Simulated successfully after approval.';
}

function findApprovalStepIndex(run, approval) {
  const steps = Array.isArray(run?.steps) ? run.steps : [];

  // Best match: exact workflow node ID.
  if (approval?.nodeId) {
    const exactIndex = steps.findIndex(
      (step) => step.nodeId === approval.nodeId
    );

    if (exactIndex >= 0) {
      return exactIndex;
    }
  }

  // Fallback: current waiting human step.
  const waitingHumanIndex = steps.findIndex(
    (step) =>
      step.status === 'waiting' &&
      ['approval', 'review'].includes(step.type)
  );

  if (waitingHumanIndex >= 0) {
    return waitingHumanIndex;
  }

  // Final fallback: first approval/review step.
  return steps.findIndex((step) =>
    ['approval', 'review'].includes(step.type)
  );
}

function syncApprovalDecisionToRun(approvalDecision) {
  if (!approvalDecision?.runId) {
    return {
      ok: false,
      reason: 'Approval has no Run ID.',
    };
  }

  const runs = getRunHistory();

  const run = runs.find(
    (item) => item.id === approvalDecision.runId
  );

  if (!run) {
    return {
      ok: false,
      reason: 'Matching run record was not found.',
    };
  }

  const originalSteps = Array.isArray(run.steps)
    ? run.steps
    : [];

  const approvalIndex = findApprovalStepIndex(
    run,
    approvalDecision
  );

  if (approvalIndex < 0) {
    return {
      ok: false,
      reason: 'Human Approval step was not found in the run.',
    };
  }

  if (approvalDecision.status === 'Approved') {
    const updatedSteps = originalSteps.map(
      (step, index) => {
        if (index === approvalIndex) {
          return {
            ...step,
            status: 'completed',
            note: `Approved by ${
              approvalDecision.decisionBy || 'Reviewer'
            }. Test resumed.`,
          };
        }

        if (
          index > approvalIndex &&
          ['pending', 'waiting'].includes(step.status)
        ) {
          return {
            ...step,
            status: 'completed',
            note: getPostApprovalNote(step),
          };
        }

        return step;
      }
    );

    const completedRun = finishRun(
      run,
      'Completed',
      {
        steps: updatedSteps,
        approval: {
          approvalId: approvalDecision.id,
          decision: 'Approved',
          by:
            approvalDecision.decisionBy ||
            approvalDecision.approver ||
            'Reviewer',
          decidedAt:
            approvalDecision.decidedAt ||
            new Date().toISOString(),
          note: approvalDecision.decisionNote || '',
        },
      }
    );

    saveRun(completedRun);

    const verified = getRunHistory().find(
      (item) => item.id === run.id
    );

    return {
      ok: verified?.status === 'Completed',
      reason:
        verified?.status === 'Completed'
          ? ''
          : 'Run record did not save as Completed.',
    };
  }

  if (approvalDecision.status === 'Rejected') {
    const updatedSteps = originalSteps.map(
      (step, index) => {
        if (index === approvalIndex) {
          return {
            ...step,
            status: 'rejected',
            note: `Rejected by ${
              approvalDecision.decisionBy || 'Reviewer'
            }. Workflow stopped.`,
          };
        }

        if (
          index > approvalIndex &&
          ['pending', 'waiting'].includes(step.status)
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

    const rejectedRun = finishRun(
      run,
      'Rejected',
      {
        steps: updatedSteps,
        approval: {
          approvalId: approvalDecision.id,
          decision: 'Rejected',
          by:
            approvalDecision.decisionBy ||
            approvalDecision.approver ||
            'Reviewer',
          decidedAt:
            approvalDecision.decidedAt ||
            new Date().toISOString(),
          note: approvalDecision.decisionNote || '',
        },
      }
    );

    saveRun(rejectedRun);

    const verified = getRunHistory().find(
      (item) => item.id === run.id
    );

    return {
      ok: verified?.status === 'Rejected',
      reason:
        verified?.status === 'Rejected'
          ? ''
          : 'Run record did not save as Rejected.',
    };
  }

  return {
    ok: false,
    reason: 'Unsupported approval decision.',
  };
}

export default function ApprovalsView() {
  const [approvals, setApprovals] = useState([]);
  const [selectedApproval, setSelectedApproval] =
    useState(null);

  const [filter, setFilter] = useState('Pending');
  const [reviewer, setReviewer] = useState('');
  const [decisionNote, setDecisionNote] = useState('');

  const loadApprovals = () => {
    const items = getApprovals();

    setApprovals(items);

    setSelectedApproval((current) => {
      if (!current) return null;

      return (
        items.find(
          (item) => item.id === current.id
        ) || null
      );
    });
  };

  useEffect(() => {
    loadApprovals();

    const unsubscribe =
      subscribeToApprovals(loadApprovals);

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!selectedApproval) {
      setReviewer('');
      setDecisionNote('');
      return;
    }

    setReviewer(
      selectedApproval.decisionBy ||
        selectedApproval.approver ||
        ''
    );

    setDecisionNote(
      selectedApproval.decisionNote || ''
    );
  }, [selectedApproval]);

  const counts = useMemo(() => {
    return {
      All: approvals.length,
      Pending: approvals.filter(
        (item) => item.status === 'Pending'
      ).length,
      Approved: approvals.filter(
        (item) => item.status === 'Approved'
      ).length,
      Rejected: approvals.filter(
        (item) => item.status === 'Rejected'
      ).length,
    };
  }, [approvals]);

  const filteredApprovals = useMemo(() => {
    if (filter === 'All') {
      return approvals;
    }

    return approvals.filter(
      (item) => item.status === filter
    );
  }, [approvals, filter]);

  const handleDecision = (decision) => {
    if (!selectedApproval) return;

    if (!reviewer.trim()) {
      window.alert(
        'Enter the reviewer name before making a decision.'
      );
      return;
    }

    const action =
      decision === 'Approved'
        ? 'Approve'
        : 'Reject';

    const confirmed = window.confirm(
      `${action} this workflow request?`
    );

    if (!confirmed) return;

    const updatedApproval = decideApproval({
      approvalId: selectedApproval.id,
      decision,
      decisionBy: reviewer.trim(),
      decisionNote: decisionNote.trim(),
    });

    if (!updatedApproval) {
      window.alert(
        'Approval decision could not be saved.'
      );
      return;
    }

    const syncResult =
      syncApprovalDecisionToRun(updatedApproval);

    setSelectedApproval(updatedApproval);

    setFilter(
      decision === 'Approved'
        ? 'Approved'
        : 'Rejected'
    );

    if (!syncResult.ok) {
      window.alert(
        `Approval was saved, but the run could not be updated: ${syncResult.reason}`
      );
    }
  };

  const repairSelectedRun = () => {
    if (
      !selectedApproval ||
      !['Approved', 'Rejected'].includes(
        selectedApproval.status
      )
    ) {
      return;
    }

    const result =
      syncApprovalDecisionToRun(
        selectedApproval
      );

    if (result.ok) {
      window.alert(
        'Run history synced successfully.'
      );
    } else {
      window.alert(
        `Run sync failed: ${result.reason}`
      );
    }
  };

  const removeApproval = () => {
    if (!selectedApproval) return;

    const confirmed = window.confirm(
      'Delete this approval record?'
    );

    if (!confirmed) return;

    deleteApproval(
      selectedApproval.id
    );

    setSelectedApproval(null);
  };

  const clearAll = () => {
    if (approvals.length === 0) return;

    const confirmed = window.confirm(
      'Clear all approval history?'
    );

    if (!confirmed) return;

    clearApprovalHistory();

    setSelectedApproval(null);
  };

  const filters = [
    'Pending',
    'Approved',
    'Rejected',
    'All',
  ];

  return (
    <div className="approvalsPage">
      <div className="approvalsTopbar">
        <div>
          <h1>Approvals</h1>
          <span>
            Human review and decision queue
          </span>
        </div>

        <button
          className="approvalsClearButton"
          onClick={clearAll}
          disabled={
            approvals.length === 0
          }
        >
          Clear History
        </button>
      </div>

      <div className="approvalsFilters">
        {filters.map((item) => (
          <button
            key={item}
            className={
              filter === item
                ? 'active'
                : ''
            }
            onClick={() => {
              setFilter(item);
              setSelectedApproval(null);
            }}
          >
            {item}
            <span>{counts[item]}</span>
          </button>
        ))}
      </div>

      {filteredApprovals.length === 0 ? (
        <div className="approvalsEmpty">
          <div className="approvalsEmptyIcon">
            ✓
          </div>

          <h2>
            {filter === 'Pending'
              ? 'No approvals waiting'
              : `No ${filter.toLowerCase()} approvals`}
          </h2>

          <p>
            Workflow requests requiring human
            review will appear here.
          </p>
        </div>
      ) : (
        <div className="approvalsLayout">
          <div className="approvalsList">
            {filteredApprovals.map(
              (approval) => (
                <button
                  key={approval.id}
                  className={`
                    approvalCard
                    ${
                      selectedApproval?.id ===
                      approval.id
                        ? 'selected'
                        : ''
                    }
                  `}
                  onClick={() =>
                    setSelectedApproval(
                      approval
                    )
                  }
                >
                  <div className="approvalCardTop">
                    <div>
                      <strong>
                        {approval.agentName ||
                          'Agent'}
                      </strong>

                      <span>
                        {approval.workflowName ||
                          'Main Workflow'}
                      </span>
                    </div>

                    <span
                      className={`
                        approvalStatus
                        approvalStatus-${statusClass(
                          approval.status
                        )}
                      `}
                    >
                      {approval.status}
                    </span>
                  </div>

                  <div className="approvalCardBlock">
                    {approval.blockName ||
                      'Human Approval'}
                  </div>

                  {approval.message && (
                    <p className="approvalCardMessage">
                      {approval.message}
                    </p>
                  )}

                  <div className="approvalCardMeta">
                    <span>
                      {approval.approver ||
                        'Reviewer'}
                    </span>

                    <span>
                      {formatDate(
                        approval.requestedAt
                      )}
                    </span>
                  </div>
                </button>
              )
            )}
          </div>

          <div className="approvalDetails">
            {!selectedApproval ? (
              <div className="approvalDetailsEmpty">
                <div>✓</div>
                <p>
                  Select an approval request to
                  review its details.
                </p>
              </div>
            ) : (
              <>
                <div className="approvalDetailsHeader">
                  <div>
                    <h2>
                      {
                        selectedApproval.agentName
                      }
                    </h2>

                    <span>
                      {
                        selectedApproval.workflowName
                      }
                    </span>
                  </div>

                  <span
                    className={`
                      approvalStatus
                      approvalStatus-${statusClass(
                        selectedApproval.status
                      )}
                    `}
                  >
                    {
                      selectedApproval.status
                    }
                  </span>
                </div>

                <div className="approvalSummaryGrid">
                  <div>
                    <span>
                      Approval Step
                    </span>
                    <strong>
                      {
                        selectedApproval.blockName
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Assigned To
                    </span>
                    <strong>
                      {
                        selectedApproval.approver
                      }
                    </strong>
                  </div>

                  <div>
                    <span>
                      Requested
                    </span>
                    <strong>
                      {formatDate(
                        selectedApproval.requestedAt
                      )}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Run ID
                    </span>
                    <strong>
                      {selectedApproval.runId ||
                        '-'}
                    </strong>
                  </div>
                </div>

                <div className="approvalRequestBox">
                  <span>
                    Approval Request
                  </span>
                  <p>
                    {selectedApproval.message ||
                      'No approval message provided.'}
                  </p>
                </div>

                {selectedApproval.status ===
                'Pending' ? (
                  <div className="approvalDecisionPanel">
                    <div className="approvalDecisionHeading">
                      Human Decision
                    </div>

                    <label>
                      Reviewer
                    </label>

                    <input
                      value={reviewer}
                      onChange={(e) =>
                        setReviewer(
                          e.target.value
                        )
                      }
                      placeholder="Example: Senior CA"
                    />

                    <label>
                      Decision Note
                    </label>

                    <textarea
                      rows={4}
                      value={
                        decisionNote
                      }
                      onChange={(e) =>
                        setDecisionNote(
                          e.target.value
                        )
                      }
                      placeholder="Optional review note..."
                    />

                    <div className="approvalDecisionActions">
                      <button
                        className="approvalApproveButton"
                        onClick={() =>
                          handleDecision(
                            'Approved'
                          )
                        }
                      >
                        ✓ Approve
                      </button>

                      <button
                        className="approvalRejectButton"
                        onClick={() =>
                          handleDecision(
                            'Rejected'
                          )
                        }
                      >
                        × Reject
                      </button>
                    </div>

                    <div className="approvalSafetyNotice">
                      This is a safe test simulation.
                      Approval updates the saved test
                      run and simulates downstream
                      steps. No email, API call,
                      database change, or external
                      action is executed.
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="approvalDecisionResult">
                      <div>
                        <span>
                          Decision
                        </span>
                        <strong>
                          {
                            selectedApproval.status
                          }
                        </strong>
                      </div>

                      <div>
                        <span>
                          Decision By
                        </span>
                        <strong>
                          {selectedApproval.decisionBy ||
                            '-'}
                        </strong>
                      </div>

                      <div>
                        <span>
                          Decided At
                        </span>
                        <strong>
                          {formatDate(
                            selectedApproval.decidedAt
                          )}
                        </strong>
                      </div>

                      {selectedApproval.decisionNote && (
                        <div className="approvalResultNote">
                          <span>
                            Review Note
                          </span>
                          <p>
                            {
                              selectedApproval.decisionNote
                            }
                          </p>
                        </div>
                      )}
                    </div>

                    <button
                      className="approvalApproveButton"
                      style={{ marginTop: '14px' }}
                      onClick={repairSelectedRun}
                    >
                      ↻ Sync Run History
                    </button>
                  </>
                )}

                <button
                  className="approvalDeleteButton"
                  onClick={
                    removeApproval
                  }
                >
                  Delete Approval Record
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
