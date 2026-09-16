const APPROVALS_KEY = 'gra-approval-queue';
const APPROVALS_EVENT = 'gra-approvals-updated';

export function getApprovals() {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(APPROVALS_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveApproval(approval) {
  if (typeof window === 'undefined') return;

  const current = getApprovals();

  const existingIndex = current.findIndex(
    (item) => item.id === approval.id
  );

  let updated;

  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = approval;
  } else {
    updated = [approval, ...current];
  }

  localStorage.setItem(
    APPROVALS_KEY,
    JSON.stringify(updated.slice(0, 200))
  );

  window.dispatchEvent(
    new CustomEvent(APPROVALS_EVENT)
  );
}

export function createApprovalRequest({
  runId,
  agentId,
  agentName,
  nodeId,
  blockName = 'Human Approval',
  approver = 'Reviewer',
  message = '',
}) {
  const now = new Date().toISOString();

  const approval = {
    id: `approval-${Date.now()}`,

    runId,
    agentId,
    agentName,

    workflowName: 'Main Workflow',

    nodeId,
    blockName,

    approver,
    message,

    status: 'Pending',

    requestedAt: now,
    decidedAt: null,

    decisionBy: null,
    decisionNote: '',
  };

  saveApproval(approval);

  return approval;
}

export function decideApproval({
  approvalId,
  decision,
  decisionBy,
  decisionNote = '',
}) {
  const approvals = getApprovals();

  const approval = approvals.find(
    (item) => item.id === approvalId
  );

  if (!approval) return null;

  const updated = {
    ...approval,

    status:
      decision === 'Approved'
        ? 'Approved'
        : 'Rejected',

    decidedAt: new Date().toISOString(),

    decisionBy:
      decisionBy ||
      approval.approver ||
      'Reviewer',

    decisionNote,
  };

  saveApproval(updated);

  return updated;
}

export function deleteApproval(approvalId) {
  if (typeof window === 'undefined') return;

  const updated = getApprovals().filter(
    (item) => item.id !== approvalId
  );

  localStorage.setItem(
    APPROVALS_KEY,
    JSON.stringify(updated)
  );

  window.dispatchEvent(
    new CustomEvent(APPROVALS_EVENT)
  );
}

export function clearApprovalHistory() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(APPROVALS_KEY);

  window.dispatchEvent(
    new CustomEvent(APPROVALS_EVENT)
  );
}

export function subscribeToApprovals(callback) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(
    APPROVALS_EVENT,
    callback
  );

  return () => {
    window.removeEventListener(
      APPROVALS_EVENT,
      callback
    );
  };
}
