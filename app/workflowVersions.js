const VERSION_EVENT =
  'gra-workflow-version-updated';

function getStorageKey(agentId) {
  return `gra-workflow-version-${agentId}`;
}

function createSnapshot(nodes = [], edges = []) {
  return {
    nodes,
    edges,
    savedAt: new Date().toISOString(),
  };
}

function sameWorkflow(
  snapshot,
  nodes = [],
  edges = []
) {
  if (!snapshot) return false;

  try {
    return (
      JSON.stringify(snapshot.nodes || []) ===
        JSON.stringify(nodes || []) &&
      JSON.stringify(snapshot.edges || []) ===
        JSON.stringify(edges || [])
    );
  } catch {
    return false;
  }
}

function notifyVersionChange(agentId) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent(VERSION_EVENT, {
      detail: {
        agentId,
      },
    })
  );
}

export function getWorkflowVersionState(
  agentId
) {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getStorageKey(agentId);

  try {
    const saved =
      localStorage.getItem(key);

    if (!saved) {
      return {
        agentId,

        draftVersion: 1,

        publishedVersion: null,

        isDirty: true,

        draft: null,

        published: null,

        lastPublishedAt: null,
      };
    }

    return JSON.parse(saved);
  } catch {
    localStorage.removeItem(key);

    return {
      agentId,

      draftVersion: 1,

      publishedVersion: null,

      isDirty: true,

      draft: null,

      published: null,

      lastPublishedAt: null,
    };
  }
}

export function initializeWorkflowVersion({
  agentId,
  nodes = [],
  edges = [],
}) {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getStorageKey(agentId);

  const existing =
    getWorkflowVersionState(agentId);

  if (existing?.draft) {
    return existing;
  }

  const initialState = {
    agentId,

    draftVersion: 1,

    publishedVersion: null,

    isDirty: true,

    draft: createSnapshot(
      nodes,
      edges
    ),

    published: null,

    lastPublishedAt: null,
  };

  localStorage.setItem(
    key,
    JSON.stringify(initialState)
  );

  notifyVersionChange(agentId);

  return initialState;
}

export function saveWorkflowDraft({
  agentId,
  nodes = [],
  edges = [],
}) {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getStorageKey(agentId);

  const current =
    getWorkflowVersionState(agentId) ||
    initializeWorkflowVersion({
      agentId,
      nodes,
      edges,
    });

  /*
    No actual workflow change.
    Do not create a new draft version.
  */
  if (
    current?.draft &&
    sameWorkflow(
      current.draft,
      nodes,
      edges
    )
  ) {
    return current;
  }

  let nextDraftVersion =
    current.draftVersion || 1;

  /*
    Once a published workflow is edited,
    create the next draft version.

    Example:
    Published v1
         ↓ edit
    Draft v2
  */
  if (
    current.publishedVersion &&
    current.isDirty === false
  ) {
    nextDraftVersion =
      current.publishedVersion + 1;
  }

  const updated = {
    ...current,

    agentId,

    draftVersion:
      nextDraftVersion,

    isDirty: true,

    draft: createSnapshot(
      nodes,
      edges
    ),
  };

  localStorage.setItem(
    key,
    JSON.stringify(updated)
  );

  notifyVersionChange(agentId);

  return updated;
}

export function publishWorkflow({
  agentId,
  nodes = [],
  edges = [],
}) {
  if (typeof window === 'undefined') {
    return null;
  }

  const key = getStorageKey(agentId);

  const current =
    getWorkflowVersionState(agentId) ||
    initializeWorkflowVersion({
      agentId,
      nodes,
      edges,
    });

  const version =
    current.draftVersion || 1;

  const publishedAt =
    new Date().toISOString();

  const snapshot = createSnapshot(
    nodes,
    edges
  );

  const updated = {
    ...current,

    agentId,

    draftVersion: version,

    publishedVersion: version,

    isDirty: false,

    draft: snapshot,

    published: {
      ...snapshot,

      version,

      publishedAt,
    },

    lastPublishedAt:
      publishedAt,
  };

  localStorage.setItem(
    key,
    JSON.stringify(updated)
  );

  notifyVersionChange(agentId);

  return updated;
}

export function getPublishedWorkflow(
  agentId
) {
  const state =
    getWorkflowVersionState(agentId);

  if (!state?.published) {
    return null;
  }

  return state.published;
}

export function subscribeToWorkflowVersions(
  callback
) {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event) => {
    callback(event);
  };

  window.addEventListener(
    VERSION_EVENT,
    handler
  );

  return () => {
    window.removeEventListener(
      VERSION_EVENT,
      handler
    );
  };
}
