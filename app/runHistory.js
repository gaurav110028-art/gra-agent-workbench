const RUNS_KEY = 'gra-run-history';
const RUNS_EVENT = 'gra-runs-updated';

export function getRunHistory() {
  if (typeof window === 'undefined') return [];

  try {
    const saved = localStorage.getItem(RUNS_KEY);

    if (!saved) return [];

    const parsed = JSON.parse(saved);

    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveRun(run) {
  if (typeof window === 'undefined') return;

  const current = getRunHistory();

  const existingIndex = current.findIndex(
    (item) => item.id === run.id
  );

  let updated;

  if (existingIndex >= 0) {
    updated = [...current];
    updated[existingIndex] = run;
  } else {
    updated = [run, ...current];
  }

  // Keep latest 100 runs for now
  localStorage.setItem(
    RUNS_KEY,
    JSON.stringify(updated.slice(0, 100))
  );

  window.dispatchEvent(
    new CustomEvent(RUNS_EVENT)
  );
}

export function updateRun(runId, changes) {
  const runs = getRunHistory();

  const run = runs.find(
    (item) => item.id === runId
  );

  if (!run) return;

  saveRun({
    ...run,
    ...changes,
  });
}

export function deleteRun(runId) {
  if (typeof window === 'undefined') return;

  const updated = getRunHistory().filter(
    (run) => run.id !== runId
  );

  localStorage.setItem(
    RUNS_KEY,
    JSON.stringify(updated)
  );

  window.dispatchEvent(
    new CustomEvent(RUNS_EVENT)
  );
}

export function clearRunHistory() {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(RUNS_KEY);

  window.dispatchEvent(
    new CustomEvent(RUNS_EVENT)
  );
}

export function subscribeToRunHistory(callback) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  window.addEventListener(
    RUNS_EVENT,
    callback
  );

  return () => {
    window.removeEventListener(
      RUNS_EVENT,
      callback
    );
  };
}

export function createRun({
  agentId,
  agentName,
  steps = [],
}) {
  const now = new Date();

  return {
    id: `run-${Date.now()}`,

    agentId,
    agentName,

    workflowName: 'Main Workflow',

    type: 'Test Run',

    status: 'Running',

    startedAt: now.toISOString(),

    finishedAt: null,

    durationMs: null,

    steps,

    approval: null,
  };
}

export function finishRun(
  run,
  status,
  extra = {}
) {
  const finishedAt = new Date();

  const startedAt = new Date(
    run.startedAt
  );

  return {
    ...run,

    ...extra,

    status,

    finishedAt:
      finishedAt.toISOString(),

    durationMs:
      finishedAt.getTime() -
      startedAt.getTime(),
  };
}
